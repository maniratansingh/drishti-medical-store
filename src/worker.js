/**
 * Cloudflare Worker Entrypoint (Workers + Static Assets)
 *
 * Static assets in ./public are served directly by Cloudflare's edge before this
 * Worker is invoked. Requests to /api/enquiry are handled here for validation,
 * optional ENQUIRIES_KV persistence, and Telegram notifications using secrets:
 *   - env.TELEGRAM_BOT_TOKEN
 *   - env.TELEGRAM_CHAT_ID
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
    },
  });
}

function cleanText(value, maxLen = 160) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D+/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

function generateEnquiryId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < bytes.length; i += 1) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `ENQ-${suffix}`;
}

function formatIstTimestamp(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: true,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function buildTelegramMessage({
  enquiryId,
  customerName,
  mobile,
  selectedItems,
  unmatchedQueries,
  submittedAt,
}) {
  const lines = [
    'NEW MEDICINE AVAILABILITY ENQUIRY',
    '',
    `Customer: ${customerName}`,
    `Mobile: ${mobile}`,
    '',
  ];

  if (selectedItems.length > 0) {
    lines.push('Requested Medicines:');
    selectedItems.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.name}`);
      if (item.manufacturer || item.brand) {
        lines.push(`   Manufacturer: ${item.manufacturer || item.brand}`);
      }
      if (item.composition) {
        lines.push(`   Composition: ${item.composition}`);
      }
      if (item.strength) {
        lines.push(`   Strength / Variant: ${item.strength}`);
      }
      if (item.id) {
        lines.push(`   Product ID: ${item.id}`);
      }
    });
    lines.push('');
  }

  if (unmatchedQueries.length > 0) {
    lines.push('Unmatched Search (Customer search without database match):');
    unmatchedQueries.forEach((query) => {
      lines.push(`Customer entered: "${query}"`);
    });
    lines.push('');
  }

  lines.push(`Enquiry ID: ${enquiryId}`);
  lines.push('Status: Pending Callback');
  lines.push(`Submitted: ${submittedAt} (IST)`);

  return lines.join('\n');
}

async function handleEnquiryPost(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON request body.' }, 400);
  }

  const customerName = cleanText(payload?.customerName, 80);
  const mobileDigits = normalizePhone(payload?.mobile);

  if (customerName.length < 2) {
    return jsonResponse({ ok: false, error: 'Please enter a valid patient / customer name.' }, 400);
  }

  if (mobileDigits.length < 10 || mobileDigits.length > 15) {
    return jsonResponse({ ok: false, error: 'Please enter a valid 10-digit mobile number.' }, 400);
  }

  const rawItems = Array.isArray(payload?.selectedItems) ? payload.selectedItems : [];
  const selectedItems = rawItems
    .slice(0, 25)
    .map((item) => ({
      id: cleanText(item?.id, 40),
      name: cleanText(item?.name, 140),
      brand: cleanText(item?.brand, 100),
      manufacturer: cleanText(item?.manufacturer, 120),
      composition: cleanText(item?.composition, 180),
      strength: cleanText(item?.strength, 80),
    }))
    .filter((item) => item.name.length > 0);

  const rawUnmatched = Array.isArray(payload?.unmatchedQueries) ? payload.unmatchedQueries : [];
  const unmatchedQueries = rawUnmatched
    .slice(0, 10)
    .map((q) => cleanText(q, 140))
    .filter((q) => q.length >= 2);

  if (selectedItems.length === 0 && unmatchedQueries.length === 0) {
    return jsonResponse(
      { ok: false, error: 'Please select at least one medicine or add your search query before submitting.' },
      400
    );
  }

  const enquiryId = generateEnquiryId();
  const submittedAt = formatIstTimestamp(new Date());

  const record = {
    enquiryId,
    customerName,
    mobile: mobileDigits,
    selectedItems,
    unmatchedQueries,
    status: 'Pending Callback',
    submittedAt,
    createdAtIso: new Date().toISOString(),
  };

  if (env?.ENQUIRIES_KV) {
    try {
      await env.ENQUIRIES_KV.put(`enquiry:${enquiryId}`, JSON.stringify(record), {
        expirationTtl: 60 * 60 * 24 * 30,
      });
    } catch {
      // Optional KV persistence failure must not block enquiry alert delivery.
    }
  }

  const messageText = buildTelegramMessage(record);
  const botToken = cleanText(env?.TELEGRAM_BOT_TOKEN, 160);
  const chatId = cleanText(env?.TELEGRAM_CHAT_ID, 64);

  if (!botToken || !chatId) {
    return jsonResponse(
      {
        ok: true,
        enquiryId,
        submittedAt,
        deliveredViaTelegram: false,
        telegramConfigured: false,
        formattedMessage: messageText,
        notice: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured in environment.',
      },
      202
    );
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        disable_web_page_preview: true,
      }),
    });

    const tgData = await tgRes.json().catch(() => ({}));
    if (!tgRes.ok || !tgData.ok) {
      return jsonResponse(
        {
          ok: false,
          enquiryId,
          submittedAt,
          deliveredViaTelegram: false,
          telegramConfigured: true,
          formattedMessage: messageText,
          error: 'Telegram Bot API rejected the notification.',
        },
        502
      );
    }

    return jsonResponse({
      ok: true,
      enquiryId,
      submittedAt,
      deliveredViaTelegram: true,
      telegramConfigured: true,
    });
  } catch {
    return jsonResponse(
      {
        ok: false,
        enquiryId,
        submittedAt,
        deliveredViaTelegram: false,
        telegramConfigured: true,
        formattedMessage: messageText,
        error: 'Unable to reach Telegram Bot API.',
      },
      502
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/enquiry') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === 'POST') {
        return handleEnquiryPost(request, env);
      }
      return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
    }

    if (env?.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};

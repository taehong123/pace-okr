const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#24323a"/><circle cx="22" cy="32" r="11" fill="none" stroke="#fff" stroke-width="6"/><path d="M36 18h8.5c7.5 0 12.5 4.5 12.5 11.5S52 41 44.5 41H42v9h-6V18zm6 6v11h2.5c4 0 6.5-1.8 6.5-5.5S48.5 24 44.5 24H42z" fill="#9fd4bf"/></svg>`;

export async function GET() {
  return new Response(favicon, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml",
    },
  });
}

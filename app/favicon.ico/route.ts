import { brandSvg } from "@/lib/brand-artwork";

export async function GET() {
  return new Response(brandSvg(), {
    headers: {
      "Cache-Control": "public, no-cache",
      "Content-Type": "image/svg+xml",
    },
  });
}

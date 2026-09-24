// No body is read, stored or sent anywhere. Real private CRUD requires authentication first.
export async function POST() {
  return Response.json(
    { code: "FEATURE_NOT_IMPLEMENTED", message: "Private letters and AI are not implemented in this starter." },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

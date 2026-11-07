import notices from "../../config/json/notices.json";

export function GET() {
  return Response.json(notices);
}

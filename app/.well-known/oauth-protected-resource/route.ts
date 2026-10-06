import { connection } from "next/server";
import { serveMcpMetadata } from "@/lib/product-intelligence/http-runtime";

export async function GET(request: Request) {
  await connection();
  return serveMcpMetadata(request);
}

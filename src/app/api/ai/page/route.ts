import { aiRead } from "@/modules/ai/read-route";
import { PageAsk, proposeForPage } from "@/modules/ai/assist";

export async function POST(request: Request) {
  return aiRead(request, PageAsk, proposeForPage, { requireModel: true });
}

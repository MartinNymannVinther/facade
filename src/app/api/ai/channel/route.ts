import { aiRead } from "@/modules/ai/read-route";
import { ChannelAsk, proposeCatchUp } from "@/modules/ai/assist";

export async function POST(request: Request) {
  return aiRead(request, ChannelAsk, proposeCatchUp, { requireModel: true });
}

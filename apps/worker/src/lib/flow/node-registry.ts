import type { NodeType } from "./types.js"
import { SpamFilterNode } from "./nodes/spam-filter.js"
import { ClassifyNode } from "./nodes/classify.js"
import { EnrichNode } from "./nodes/enrich.js"
import { DecideNode } from "./nodes/decide.js"
import { DraftNode } from "./nodes/draft.js"
import { OrderLookupNode } from "./nodes/order-lookup.js"
import { RefundLadderNode } from "./nodes/refund-ladder.js"
import { SendReplyNode } from "./nodes/send-reply.js"
import { ApiActionNode } from "./nodes/api-action.js"

// Maps flow_nodes.node_type to its NodeType implementation.
export const NODE_REGISTRY: Record<string, NodeType> = {
  [SpamFilterNode.type]: SpamFilterNode,
  [ClassifyNode.type]: ClassifyNode,
  [EnrichNode.type]: EnrichNode,
  [DecideNode.type]: DecideNode,
  [DraftNode.type]: DraftNode,
  [OrderLookupNode.type]: OrderLookupNode,
  [RefundLadderNode.type]: RefundLadderNode,
  [SendReplyNode.type]: SendReplyNode,
  [ApiActionNode.type]: ApiActionNode,
}

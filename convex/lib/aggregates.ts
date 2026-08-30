import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import { DataModel, Doc } from "../_generated/dataModel";

export const claimsAggregate = new TableAggregate<{
  Key: number;
  DataModel: DataModel;
  TableName: "claims";
  Namespace: string;
}>(components.aggregate, {
  sortKey: (doc: Doc<"claims">) => doc.createdAt,
  sumValue: (doc: Doc<"claims">) => doc.deniedAmount,
  namespace: (doc: Doc<"claims">) => (doc.userId ? (doc.userId as string) : "global"),
});

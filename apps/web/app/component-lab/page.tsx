import { notFound } from "next/navigation";
import ComponentLab from "./component-lab";

export default function ComponentLabPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ComponentLab />;
}

import { PageSkeleton } from "@/components/skeleton";

/**
 * Without this file a click on a dynamic route blocks: the browser stays on the
 * old page with the old URL until the server answers, which reads as a dead
 * link. The boundary lets the navigation commit immediately and stream the page
 * in behind this skeleton — and it is also what makes <Link> prefetch possible
 * for a dynamic route.
 */
export default function Loading() {
  return <PageSkeleton count={4} />;
}

export default function SkeletonLine({
  width = "60%",
  height = "14px",
}: {
  width?: string;
  height?: string;
}) {
  return <div className="skeleton-line" style={{ width, height }} />;
}

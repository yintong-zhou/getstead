import Image from "next/image";

/** The getstead mark (a glass drop). Decorative: the product name always sits next to it as text. */
export function BrandMark() {
  // unoptimized: the file is already sized for 32-40 px at 3x, so no image optimizer is needed.
  return <Image className="brand-mark" src="/brand/getstead-mark.png" alt="" width={36} height={36} unoptimized priority />;
}

import Image from "next/image";

/**
 * The VarCamp flame mark. The artwork is `public/varcamp-logo.svg` — the
 * official logo vectorised from the supplied PNG.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Image
        src="/varcamp-logo.svg"
        alt=""
        width={28}
        height={32}
        unoptimized
        className="shrink-0"
      />
      <span className="font-display text-xl font-extrabold tracking-tight">VARCAMP</span>
    </span>
  );
}

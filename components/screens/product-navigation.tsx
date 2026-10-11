"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { productHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function ProductNavigation({ id }: { id: string }) {
  const pathname = usePathname();
  const items = [{ label: "Producto", href: productHref(id) }, { label: "Información y oferta", href: productHref(id, "importado") },
    { label: "Página", href: productHref(id, "textos") }, { label: "Publicación", href: productHref(id, "publicar") }];
  const active = (href: string) => pathname === href || (href === productHref(id, "textos") && pathname === productHref(id, "imagenes"));
  return <nav aria-label="Producto" className="flex gap-1 overflow-x-auto border-b px-4 lg:px-8">
    {items.map(item => <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined}
      className={cn("flex min-h-touch shrink-0 items-center border-b-2 border-transparent px-3 text-label", active(item.href) ? "border-primary text-primary" : "text-muted-foreground hover:bg-accent")}>{item.label}</Link>)}
  </nav>;
}

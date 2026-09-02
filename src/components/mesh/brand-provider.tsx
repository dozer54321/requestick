import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPublicBrand } from "@/lib/mesh/api";
import { applyBranding, DEFAULT_PUBLIC_BRAND } from "@/lib/mesh/brand";
import { BrandContext } from "./brand-context";

export { useBrand, useBranding } from "./brand-context";

export function BrandProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["mesh-brand"],
    queryFn: () => getPublicBrand(),
    staleTime: 15_000,
  });
  const brand = query.data ?? DEFAULT_PUBLIC_BRAND;

  useEffect(() => {
    applyBranding(brand);
  }, [brand]);

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

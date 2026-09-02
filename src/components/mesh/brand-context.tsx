import { createContext, useContext } from "react";
import { DEFAULT_PUBLIC_BRAND } from "@/lib/mesh/brand";
import type { PublicBrand } from "@/lib/mesh/types";

export const BrandContext = createContext<PublicBrand>(DEFAULT_PUBLIC_BRAND);

export function useBranding(): PublicBrand {
  return useContext(BrandContext);
}

export const useBrand = useBranding;

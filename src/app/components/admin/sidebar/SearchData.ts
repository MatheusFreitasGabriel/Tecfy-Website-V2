import { sidebarBlocks, type SidebarItem } from "./SidebarData";

export type AdminFeature = SidebarItem;

/** Funcionalidades pesquisáveis: todas as telas da sidebar (edite em SidebarData.ts). */
export const adminFeatures: AdminFeature[] = sidebarBlocks.flatMap((block) => block.items);

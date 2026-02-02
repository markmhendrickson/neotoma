import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { DesignSystemIndex } from "./DesignSystemIndex";
import { ColorsPage } from "./ColorsPage";
import { TypographyPage } from "./TypographyPage";
import { StyleGuidePage } from "./StyleGuidePage";
import { SpacingPage } from "./SpacingPage";
import { ButtonsPage } from "./ButtonsPage";
import { InputsPage } from "./InputsPage";
import { TablesPage } from "./TablesPage";
import { CardsPage } from "./CardsPage";
import { BadgesPage } from "./BadgesPage";
import { TabsPage } from "./TabsPage";
import { ProgressPage } from "./ProgressPage";
import { SkeletonPage } from "./SkeletonPage";
import { SwitchPage } from "./SwitchPage";
import { TooltipPage } from "./TooltipPage";
import { CollapsiblePage } from "./CollapsiblePage";
import { PageFormatsPage } from "./PageFormatsPage";

export function DesignSystemRouter() {
  return (
    <Routes>
      <Route index element={<DesignSystemIndex />} />
      <Route path="colors" element={<ColorsPage />} />
      <Route path="typography" element={<TypographyPage />} />
      <Route path="style-guide" element={<StyleGuidePage />} />
      <Route path="page-formats" element={<PageFormatsPage />} />
      <Route path="spacing" element={<SpacingPage />} />
      <Route path="buttons" element={<ButtonsPage />} />
      <Route path="inputs" element={<InputsPage />} />
      <Route path="tables" element={<TablesPage />} />
      <Route path="cards" element={<CardsPage />} />
      <Route path="badges" element={<BadgesPage />} />
      <Route path="tabs" element={<TabsPage />} />
      <Route path="progress" element={<ProgressPage />} />
      <Route path="skeleton" element={<SkeletonPage />} />
      <Route path="switch" element={<SwitchPage />} />
      <Route path="tooltip" element={<TooltipPage />} />
      <Route path="collapsible" element={<CollapsiblePage />} />
      <Route path="*" element={<Navigate to="/design-system" replace />} />
    </Routes>
  );
}

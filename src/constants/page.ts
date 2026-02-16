// Page metrics (in pixels) - assuming 96 DPI
export const PPI = 96;
export const PAGE_HEIGHT_PX = 1123; // ~297mm
export const PAGE_WIDTH_PX = 794; // ~210mm
export const HEADER_HEIGHT_PX = 96; // 1in
export const FOOTER_HEIGHT_PX = 96; // 1in
// Arabic Layout Margins
// 1in = 96px
// 0.8in = 76.8px (approx 77px)
// 1.25in = 120px
export const PAGE_MARGIN_TOP_PX = 77; // 0.8in
export const PAGE_MARGIN_BOTTOM_PX = 77; // 0.8in
export const PAGE_MARGIN_LEFT_PX = 96; // 1in
export const PAGE_MARGIN_RIGHT_PX = 120; // 1.25in (Binding edge for Arabic)
export const CONTENT_HEIGHT_PX =
  PAGE_HEIGHT_PX - PAGE_MARGIN_TOP_PX - PAGE_MARGIN_BOTTOM_PX;

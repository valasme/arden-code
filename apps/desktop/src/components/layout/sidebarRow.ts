/**
 * The look of a row in the sidebar (ADR 0032): 28px tall, rounded, no border, filled on hover and
 * when it is the open page. Its text stays on one line, however narrow the sidebar (#128).
 */
export const sidebarRow =
  "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-start text-sm whitespace-nowrap text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&.active]:bg-sidebar-accent [&.active]:font-medium";

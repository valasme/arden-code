/**
 * The look of a row in the sidebar (ADR 0032): 28px tall, no border, filled on hover and when it
 * is the open page. In a Windows contrast theme the open page is underlined instead.
 */
export const sidebarRow =
  "flex h-7 w-full min-w-0 items-center gap-2 px-2 text-start text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&.active]:bg-sidebar-accent [&.active]:font-medium forced-colors:hover:outline forced-colors:hover:outline-1 forced-colors:[&.active]:underline";

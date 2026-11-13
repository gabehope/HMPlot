// The settings and export chrome a Plot and a Facet share (TODO 60; out of viewCore.svelte and
// facetCore.svelte, Stage 118.5): the settings pane and the export panel (PlotDialogs), the
// buttons that open them (PlotControls), and which of them is open.

/** What the chrome calls on the settings pane (optionsPane.svelte). */
export interface SettingsPane {
  open(element: HTMLElement | undefined): void;
  close(options?: { restoreFocus?: boolean }): void;
  isAnchoredTo(element: HTMLElement | undefined): boolean;
}
/** What the chrome calls on the export panel (exportPanel.svelte). */
export interface ExportPanelHandle extends SettingsPane {
  open(element: HTMLElement | undefined, point?: unknown): void;
  toggle(element: HTMLElement | undefined): void;
}

export class PlotChrome {
  pane = $state<SettingsPane>();
  exportPanel = $state<ExportPanelHandle>();
  settingsButton = $state<HTMLButtonElement>();
  exportButton = $state<HTMLButtonElement>();
  settingsOpen = $state(false);
  exportOpen = $state(false);
  /** A fine pointer that hovers: the buttons reveal on hover; touch screens show them faintly. */
  canHover = $state(false);
  // The built-in settings and export buttons a pane or panel was opened from, if any: those close
  // with the buttons; one opened another way (the context menu) stays open (TODO 69).
  #builtinAnchor: HTMLElement | undefined;
  #builtinExportAnchor: HTMLElement | undefined;

  /** Call during component initialization: it follows the hover media query while mounted. */
  constructor({ canHover = false } = {}) {
    this.canHover = canHover;
    $effect(() => {
      const media = matchMedia("(any-hover: hover) and (any-pointer: fine)");
      const update = () => (this.canHover = media.matches);
      update();
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    });
  }
  openSettings(anchor: HTMLElement | undefined) {
    this.#builtinAnchor =
      anchor === this.settingsButton ? this.settingsButton : undefined;
    this.exportPanel?.close({ restoreFocus: false });
    this.pane?.open(anchor);
  }
  closeSettings() {
    this.pane?.close();
  }
  /** The settings button: open the pane above it, or close it. */
  toggleSettings(button: HTMLElement) {
    if (this.settingsOpen) this.pane?.close();
    else this.openSettings(button);
  }
  /** The export button: open the panel above it, or close it. */
  toggleExport(button: HTMLElement) {
    this.pane?.close({ restoreFocus: false });
    this.#builtinExportAnchor = button;
    this.exportPanel?.toggle(button);
  }
  /** Open the export panel at a point beside `anchor` (the context menu). */
  openExport(anchor: HTMLElement | undefined, point: unknown) {
    this.pane?.close({ restoreFocus: false });
    this.exportPanel?.open(anchor, point);
  }
  /**
   * The buttons are hidden: close what they opened. Returns whether the settings pane closed
   * (its focus does not return to a hidden button).
   */
  closeBuiltin() {
    let closed = false;
    if (this.#builtinAnchor && this.pane?.isAnchoredTo(this.#builtinAnchor)) {
      this.pane.close({ restoreFocus: false });
      closed = true;
    }
    if (
      this.exportOpen &&
      this.exportPanel?.isAnchoredTo(this.#builtinExportAnchor)
    )
      this.exportPanel.close({ restoreFocus: false });
    return closed;
  }
}

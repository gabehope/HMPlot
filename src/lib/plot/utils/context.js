import { createContext } from "svelte";

export const [getOptionsContext, setOptionsContext] = createContext();
// A template's main part takes the template's label in the settings pane and its legend, where
// the caller gives no name (ErrorBars' Segments are "Error bars", as the mark was; TODO 130.3).
export const [getMarkLabelContext, setMarkLabelContext] = createContext();

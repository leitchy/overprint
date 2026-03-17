import { create } from 'zustand';

export type Tool = 'pan' | 'addControl';

interface ToolState {
  activeTool: Tool;
  descriptionsPanelOpen: boolean;
}

interface ToolActions {
  setTool: (tool: Tool) => void;
  toggleDescriptionsPanel: () => void;
  setDescriptionsPanelOpen: (open: boolean) => void;
}

export const useToolStore = create<ToolState & ToolActions>()((set) => ({
  activeTool: 'pan',
  descriptionsPanelOpen: false,

  setTool: (tool) => {
    set({ activeTool: tool });
  },

  toggleDescriptionsPanel: () => {
    set((state) => ({ descriptionsPanelOpen: !state.descriptionsPanelOpen }));
  },

  setDescriptionsPanelOpen: (open) => {
    set({ descriptionsPanelOpen: open });
  },
}));

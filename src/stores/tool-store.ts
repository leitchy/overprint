import { create } from 'zustand';

export type Tool = 'pan' | 'addControl';

interface ToolState {
  activeTool: Tool;
}

interface ToolActions {
  setTool: (tool: Tool) => void;
}

export const useToolStore = create<ToolState & ToolActions>()((set) => ({
  activeTool: 'pan',

  setTool: (tool) => {
    set({ activeTool: tool });
  },
}));

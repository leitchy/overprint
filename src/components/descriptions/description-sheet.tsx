import type { Course, Control } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { DescriptionCell, NumberCell } from './description-cell';
import { calculateCourseLength } from '@/core/geometry/course-length';

interface DescriptionSheetProps {
  course: Course;
  controls: Record<ControlId, Control>;
  mapScale: number;
  mapDpi: number;
  /** BCP 47 language tag for IOF symbol names and tooltips. Default: 'en'. */
  lang?: string;
  selectedControlId: ControlId | null;
  onCellClick?: (controlId: ControlId, column: string, cellElement: HTMLElement) => void;
  onSelectControl?: (id: ControlId) => void;
  /** Rendering mode: 'course' (default) shows full course with sequence numbers;
   *  'allControls' shows all controls sorted by code with no sequence numbers. */
  mode?: 'course' | 'allControls';
}

const GRID_COLS = 'grid-cols-[1.5rem_2rem_repeat(6,1fr)]';
const COLUMN_HEADERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const EDITABLE_COLUMNS = ['columnC', 'columnD', 'columnE', 'columnF', 'columnG', 'columnH'] as const;

export function DescriptionSheet({
  course,
  controls,
  mapScale,
  mapDpi,
  lang = 'en',
  selectedControlId,
  onCellClick,
  onSelectControl,
  mode = 'course',
}: DescriptionSheetProps) {
  const lengthMetres = calculateCourseLength(course.controls, controls, mapScale, mapDpi);
  const lengthKm = (lengthMetres / 1000).toFixed(1);

  const isAllControls = mode === 'allControls';

  // In all-controls mode, sort the controls by code number
  const displayControls = isAllControls
    ? [...course.controls].sort((a, b) => {
        const ca = controls[a.controlId];
        const cb = controls[b.controlId];
        return (ca?.code ?? 0) - (cb?.code ?? 0);
      })
    : course.controls;

  return (
    <div className="description-sheet select-none">
      {/* Header — course name or "All controls" label */}
      <div className={`grid ${GRID_COLS}`}>
        <div className="col-span-full border border-gray-800 bg-white px-2 py-1 text-center text-sm font-bold text-gray-800">
          {course.name}
        </div>
      </div>

      {/* Info row — length and climb (hidden in all-controls mode) */}
      {!isAllControls && (
        <div className={`grid ${GRID_COLS}`}>
          <div className="col-span-2 border border-gray-800 px-1 py-0.5 text-center text-[10px] text-gray-600">
            {lengthKm} km
          </div>
          <div className="col-span-6 border border-gray-800 px-1 py-0.5 text-center text-[10px] text-gray-600">
            {course.climb ? `↑ ${course.climb}m` : ''}
          </div>
        </div>
      )}

      {/* Column headers */}
      <div className={`grid ${GRID_COLS}`}>
        {COLUMN_HEADERS.map((h) => (
          <div
            key={h}
            className="border border-gray-800 bg-gray-100 px-0.5 py-0.5 text-center text-[9px] font-medium text-gray-500"
          >
            {h}
          </div>
        ))}
      </div>

      {/* Control rows */}
      {displayControls.map((cc, index) => {
        const control = controls[cc.controlId];
        if (!control) return null;

        const isSelected = cc.controlId === selectedControlId;
        const isStart = !isAllControls && cc.type === 'start';
        const isFinish = !isAllControls && cc.type === 'finish';

        return (
          <div
            key={cc.controlId}
            className={`grid ${GRID_COLS} ${isSelected ? 'bg-yellow-50' : ''}`}
            onClick={() => onSelectControl?.(cc.controlId)}
          >
            {/* Column A — sequence number (empty in all-controls mode) */}
            <NumberCell
              value={isAllControls ? '' : (isStart ? 'S' : isFinish ? 'F' : index + 1)}
              muted
            />

            {/* Column B — control code */}
            <NumberCell value={control.code} />

            {/* Columns C-H — description symbols */}
            {EDITABLE_COLUMNS.map((col) => {
              const colLetter = col.replace('column', '');
              return (
                <DescriptionCell
                  key={col}
                  value={control.description[col]}
                  lang={lang}
                  isEditable={!isAllControls}
                  isSelected={isSelected}
                  onClick={(el) => onCellClick?.(cc.controlId, colLetter, el)}
                />
              );
            })}
          </div>
        );
      })}

      {/* Empty state */}
      {displayControls.length === 0 && (
        <div className={`grid ${GRID_COLS}`}>
          <div className="col-span-full border border-dashed border-gray-300 px-2 py-4 text-center text-xs text-gray-400">
            Add controls to the map
          </div>
        </div>
      )}
    </div>
  );
}

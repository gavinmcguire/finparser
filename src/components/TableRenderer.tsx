interface TableData {
  rowCount: number;
  columnCount: number;
  cells: Array<{
    rowIndex: number;
    columnIndex: number;
    content: string;
  }>;
}

interface TableRendererProps {
  table: TableData;
}

export const TableRenderer = ({ table }: TableRendererProps) => {
  // Build 2D array from cells
  const rows: string[][] = Array(table.rowCount)
    .fill(null)
    .map(() => Array(table.columnCount).fill(""));

  table.cells.forEach((cell) => {
    rows[cell.rowIndex][cell.columnIndex] = cell.content || "";
  });

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex === 0 ? "bg-muted font-medium" : ""}>
              {row.map((cell, colIndex) => (
                <td
                  key={colIndex}
                  className="border border-border px-3 py-2 whitespace-nowrap"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

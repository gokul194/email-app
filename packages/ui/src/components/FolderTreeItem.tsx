import { useState } from 'react';
import type { PstFolder } from '@email-app/shared';

interface Props {
  folder: PstFolder;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}

export function FolderTreeItem({ folder, selectedId, onSelect, depth }: Props) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = selectedId === folder.id;
  const hasChildren = folder.children.length > 0;

  return (
    <li>
      <button
        className={`flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-sm transition-colors ${
          isSelected
            ? 'bg-blue-100 font-medium text-blue-800'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(folder.id)}
      >
        {hasChildren && (
          <span
            className="mr-1 cursor-pointer text-gray-400"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? '\u25BE' : '\u25B8'}
          </span>
        )}
        <span className="truncate">{folder.name}</span>
        {folder.messageCount > 0 && (
          <span className="ml-auto text-xs text-gray-400">
            {folder.messageCount}
          </span>
        )}
      </button>
      {hasChildren && expanded && (
        <ul>
          {folder.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

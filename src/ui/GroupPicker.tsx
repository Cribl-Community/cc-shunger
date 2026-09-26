import { SelectField } from '@capra/core';
import type { WorkerGroup } from '../api/groups';

interface Props {
  groups: WorkerGroup[];
  value: string | null;
  onChange: (groupId: string) => void;
}

export default function GroupPicker({ groups, value, onChange }: Props) {
  const items = groups.map((g) => ({
    id: g.id,
    label: g.name === g.id ? g.id : `${g.name} (${g.id})`,
  }));
  return (
    <SelectField
      label="Worker Group"
      layout="horizontal"
      placeholder="Select a Worker Group"
      items={items}
      value={value}
      onChange={(key) => key !== null && onChange(String(key))}
      canSearch={groups.length > 8}
    />
  );
}

import { describe, expect, it } from 'vitest';
import { parseGroups } from './groups';

describe('parseGroups', () => {
  it('keeps Stream groups and drops Edge fleets and Search groups', () => {
    const groups = parseGroups({
      items: [
        { id: 'default', type: 'stream', workerCount: 2, git: { localChanges: 3 } },
        { id: 'default_fleet', type: 'edge' },
        { id: 'default_search', type: 'search' },
        { id: 'legacy_fleet', isFleet: true },
        { id: 'legacy_stream' },
      ],
    });
    expect(groups.map((g) => g.id)).toEqual(['default', 'legacy_stream']);
    expect(groups[0]).toEqual({ id: 'default', name: 'default', workerCount: 2, localChanges: 3 });
  });

  it('sorts by display name and tolerates an empty response', () => {
    expect(parseGroups({})).toEqual([]);
    const groups = parseGroups({
      items: [
        { id: 'b', name: 'Zulu', type: 'stream' },
        { id: 'a', name: 'Alpha', type: 'stream' },
      ],
    });
    expect(groups.map((g) => g.name)).toEqual(['Alpha', 'Zulu']);
  });
});

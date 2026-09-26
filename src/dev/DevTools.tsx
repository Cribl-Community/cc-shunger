// Dev-only tools, shown in Live Preview and excluded from production builds.
import DemoSeeder from './DemoSeeder';
import Phase0Probe from './Phase0Probe';

export default function DevTools({ group }: { group: string | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {group && <DemoSeeder key={group} group={group} />}
      <Phase0Probe />
    </div>
  );
}

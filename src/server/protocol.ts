import type {
  ProtocolEvent,
  ProtocolPayloads,
  ProtocolType,
  DemoProtocolRow,
} from "../domain/types";
export type Emit = <K extends ProtocolType>(
  type: K,
  from: string,
  to: string,
  payload: ProtocolPayloads[K],
) => void;
export class ProtocolLog {
  private events: ProtocolEvent[] = [];
  constructor(private now: () => Date = () => new Date()) {}
  emit: Emit = (type, from, to, payload) => {
    this.events.push({
      id: crypto.randomUUID(),
      ts: this.now().toISOString(),
      type,
      from,
      to,
      payload: structuredClone(payload),
    } as ProtocolEvent);
  };
  read(): ProtocolEvent[] {
    return structuredClone(this.events);
  }
  rows(): DemoProtocolRow[] {
    const aliases: Record<string, string> = {
      coordinator: "coordinator",
      alex: "agent A",
      maya: "agent B",
      jay: "agent C",
      dev: "agent D",
    };
    return this.events.map((e) => {
      const p = e.payload;
      return {
        id: e.id,
        ts: e.ts,
        type: e.type,
        fromAlias: aliases[e.from] ?? "agent",
        toAlias: aliases[e.to] ?? "group",
        ...("version" in p ? { version: p.version } : {}),
        ...("newVersion" in p ? { version: p.newVersion } : {}),
        ...("groupSize" in p ? { groupSize: p.groupSize } : {}),
        ...("reasonCode" in p ? { reasonCode: p.reasonCode } : {}),
      };
    });
  }
}

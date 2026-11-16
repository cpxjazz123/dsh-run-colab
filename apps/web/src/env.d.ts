// Local development overrides; production reaches the bridge through the
// DSH_BRIDGE service binding instead.
interface Env {
	DSH_BRIDGE_URL?: string
	DSH_BRIDGE_TOKEN?: string
}

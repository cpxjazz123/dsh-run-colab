// Local development overrides; production reaches the backend through the
// DSH_API service binding instead.
interface Env {
	DSH_API_URL?: string
	DSH_API_TOKEN?: string
}

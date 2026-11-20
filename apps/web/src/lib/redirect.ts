/** Only same-origin paths are allowed as a post-login target. */
export function safeNext(value: string | null | undefined): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
	return value
}

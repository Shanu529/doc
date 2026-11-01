export default { outputFileTracingIncludes: { "/api/**/*": ["./assets/fonts/**"] }, headers: async () => [{ source: "/(.*)", headers: [
 { key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Frame-Options", value: "DENY" } ] }] };

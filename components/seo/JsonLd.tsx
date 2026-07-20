/**
 * Renders a JSON-LD <script> tag for structured data.
 *
 * `dangerouslySetInnerHTML` is the standard, safe pattern for JSON-LD: the
 * payload is always our own serialized object (see lib/seo/schema.ts), never
 * user input, so there is no injection surface here.
 */
export function JsonLd({ data }: { data: object }): React.ReactElement {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- own structured object, not user input
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

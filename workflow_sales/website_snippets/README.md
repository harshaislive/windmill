# Qualified 1on1 Typeform embed signal

The helper `typeform_qualified_1on1_embed_signal.js` is designed for the existing Beforest Typeform popup controllers and the Hyderabad Typeform Live embed. It self-installs by wrapping `window.tf.createPopup`, preserves existing popup options/callbacks, and supports the Hyderabad Live embed alias.

## BeBuilder pages

For Poomaale 2.0 and Hyderabad, add the complete contents of `bebuilder_typeform_qualified_1on1_signal_block.html` to one BeBuilder **Code** element near the top of each page, above the first Typeform element or Typeform `embed.js` script. Do not paste it into every button. The same block supports both pages.

- Poomaale 2.0 continues using popup form `i8eBLQkz`.
- Hyderabad continues using its existing `data-tf-live="01KVFCGFDB0S9M80A066Z7XV58"` elements; the block maps that live alias to canonical form `leXyUOuT`.

Publish and clear page/CDN caches only after the Windmill receiver is deployed. Then verify one controlled qualification per page through Windmill and Meta Test Events.

## Shared-controller alternative

Load the helper before the existing controller, then change this existing line inside `openTypeform`:

```js
var popup = window.tf.createPopup(id, { hidden: h });
```

to:

```js
var popup = window.tf.createPopup(id, window.BeforestQualified1on1Signal.options(id, h));
```

The self-installing version does not require that line change; it remains documented as an explicit integration alternative.

## Supplied HTML pages

The local files below now contain an inline deployment copy of the shared helper immediately before their existing Typeform controller. Their CTA markup, styling, time tracking, hidden fields, fallback behavior, and Typeform IDs were otherwise left unchanged.

- `landing_pages_html_collective/bhopal.html`
- `landing_pages_html_collective/mumbai.html`
- `landing_pages_html_collective/hammiyala.html`

Affected pages/forms:

- `/the-bhopal-collective/` - `CYae8hmZ`
- `/the-mumbai-collective/` - `kfcjiXxR`
- `/co-forest/` - `hbDB2ybS`
- `/poomaale-2-0-collective/` - `i8eBLQkz`
- `/hyderabad-collective/` - `leXyUOuT` (the live embed ID resolves to this form)

The helper sends no answers or contact fields. It sends only the Typeform response ID, allowlisted form/question refs, event time, current Beforest URL, Meta browser attribution cookies when available, and URL UTMs. No secret is stored in browser code.

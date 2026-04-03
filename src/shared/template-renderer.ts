/** Simple template renderer for Direct Mode prompt templates.
 *  Replaces {variable} placeholders with values from InputDataPacket.
 */

import type { InputDataPacket } from "./types";

/** Replace {text}, {clipboard}, {html}, {url}, {title}, {fields} in a template string. */
export function renderTemplate(template: string, data: InputDataPacket): string {
  const vars: Record<string, string> = {
    text: data.text ?? "",
    clipboard: data.clipboard ?? "",
    html: data.html ?? "",
    url: data.context?.url ?? "",
    title: data.context?.title ?? "",
    fields: data.fields ? JSON.stringify(data.fields) : "",
  };

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return key in vars ? vars[key] : match;
  });
}

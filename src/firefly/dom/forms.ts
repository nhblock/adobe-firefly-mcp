import type { Page } from "playwright";

export interface FormInfo {
  action: string;
  fieldsets: FieldsetInfo[];
  id: string;
  labels: LabelInfo[];
  method: string;
  validation: ValidationInfo;
}

export interface FieldsetInfo {
  id: string;
  legend: string;
}

export interface LabelInfo {
  for: string;
  text: string;
}

export interface ValidationInfo {
  invalidFields: number;
  requiredFields: number;
  validFields: number;
}

export async function inspectForms(page: Page): Promise<FormInfo[]> {
  return page.evaluate(() => {
    const forms = document.querySelectorAll("form");

    return Array.from(forms).map((form) => {
      const fieldsets = Array.from(form.querySelectorAll("fieldset")).map((fs) => ({
        id: fs.id || "",
        legend: fs.querySelector("legend")?.textContent?.trim() || "",
      }));

      const labels = Array.from(form.querySelectorAll("label")).map((lb) => ({
        for: lb.getAttribute("for") || "",
        text: lb.textContent?.trim().slice(0, 100) || "",
      }));

      const requiredFields = form.querySelectorAll("[required]").length;
      let validFields = 0;
      let invalidFields = 0;

      const inputs = form.querySelectorAll("input, select, textarea");
      for (const input of Array.from(inputs)) {
        if (
          input instanceof HTMLInputElement ||
          input instanceof HTMLSelectElement ||
          input instanceof HTMLTextAreaElement
        ) {
          if (input.validity.valid) {
            validFields += 1;
          } else {
            invalidFields += 1;
          }
        }
      }

      return {
        action: form.action || "",
        fieldsets,
        id: form.id || "",
        labels,
        method: form.method || "get",
        validation: {
          invalidFields,
          requiredFields,
          validFields,
        },
      };
    });
  });
}

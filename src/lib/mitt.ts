import mitt from "mitt";

type Events = {
  "article-page-changed": number; // page number
};

export const emitter = mitt<Events>();

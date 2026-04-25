export default {
    routes: [
      {
        method: "GET",
        path: "/getTagsForCategory/:slug",
        handler: "get-tags-for-category.getTagsForCategory",
        // config: {
        //   policies: ["global::is-authenticated"],
        // },
      },
    ],
  };
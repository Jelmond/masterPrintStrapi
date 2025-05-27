export default {
    routes: [
      {
        method: "GET",
        path: "/getTagsForCategory/:id",
        handler: "get-tags-for-category.getTagsForCategory",
        // config: {
        //   policies: ["global::is-authenticated"],
        // },
      },
    ],
  };
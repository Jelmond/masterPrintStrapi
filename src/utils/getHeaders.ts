const myHeaders = new Headers();
myHeaders.append("Cookie", "cookiesession1=678A3E2D13AE9A910D8B507F2B62B0C4");

const raw = "";

export const requestOptions: any = {
  method: "POST",
  headers: myHeaders,
  body: raw,
  redirect: "follow",
};
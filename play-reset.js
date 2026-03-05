const token =
  "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIiwia2lkIjoiUHVpVFlQSXJfMDl5RnkyamgtRG16OUhMQ1ZoZW1qY1N0VVp0NjV1LWVuVk1aOExnWHQxajkwTENNNmN1RE1GdnRIaGVhUl9aMVA2T0dHQ25GdkhUX2cifQ..VThuFCzyFwtr_QNxsNydxg.iXQlyuamuvEOHXZbLDFqOCbzzIFVaeXt7nMWY7qEcQr_8gBKUnnHFUXGLPl1I4j9yHqaDyUzx57EJ9g5jbOG9MKJFlZi7GJD0qhRimJIFPL63zCJr7d4huAvu4iLQvA4FSV1MaS4tmh2wN1glSZCvvO0RfWDJWjKqtq01tRm4x-xHb7_yBLWRLxwskHemIXgpw586YbY28IiTQvHdALZUt1-t35BquXtBS39ol8wN8A8XZZkdUtq4-noyrl9P3-_HGUVYlUgPab7rIgx-OVZ3Xxx_x_7SW_To2IA00iAKXNA4_JlVdWYjkcNuIROs2v6d0edswaEtd4-dgm_zvSp8jmrJlip0NhfMK3w20lv9NXgAeW53H9_5dMfyfM0nehC5BRWHXW1t7NJCVVZPEiC3vo_OGagg286JNzQ-SpPNp5oPa-mT97X0ZGXqcjtg6zJ.6IjBvtag_QLEjPFnkkwL5IGXXMT2EqznBi3IIuGcwpQ";

async function reset() {
  const r = await fetch("http://localhost:3000/api/v1/user/reset", {
    method: "POST",
    headers: {
      Cookie:
        "authjs.session-token=" + token + "; next-auth.session-token=" + token,
      "Content-Type": "application/json",
    },
  });

  const body = await r.text();
  console.log("Status: ", r.status);
  console.log("Body: ", body);
}

reset().catch(console.error);

// utils/time.js
export function isSameDay(d1, d2) {
  return d1?.toDateString() === d2.toDateString();
}

export function timeMatches(postTime, now) {
  const [h, m] = postTime.split(":");
  return (
    now.getHours() === Number(h) &&
    now.getMinutes() === Number(m)
  );
}

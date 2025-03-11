$i = 0;
$("#start").click(function () {
  $i++;
  if ($i >= 6) {
    $("#start").hide();
    $("#stop").show();
  }
});
$("#stop").click(function () {
  alert("神金啊 没完了？就这个了！");
  $(this).hide();
  // $("#banner").show();
});
// $("#close_banner").click(function () {
//   $("#banner").hide();
// });
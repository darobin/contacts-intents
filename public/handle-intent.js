
$(function () {
    if ("intent" in window && intent.action) {
        $("#install").hide();
        $("#pick").show();
        // show the picker
    }
    else {
        $("#install").show();
        $("#pick").hide();
    }
});

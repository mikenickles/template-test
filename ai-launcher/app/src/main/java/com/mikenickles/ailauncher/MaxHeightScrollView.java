package com.mikenickles.ailauncher;

import android.content.Context;
import android.util.AttributeSet;
import android.widget.ScrollView;

/** ScrollView that never grows taller than 40% of the screen, so the app grid stays visible. */
public class MaxHeightScrollView extends ScrollView {

    public MaxHeightScrollView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int max = (int) (getResources().getDisplayMetrics().heightPixels * 0.4f);
        super.onMeasure(widthMeasureSpec, MeasureSpec.makeMeasureSpec(max, MeasureSpec.AT_MOST));
    }
}

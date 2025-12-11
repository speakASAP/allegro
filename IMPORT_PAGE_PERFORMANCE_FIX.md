# Import Page Performance Fix Plan

## Problem
The import dashboard page (`/dashboard/import`) shows "Loading import jobs..." for up to a minute before displaying any content. The page blocks rendering until the API call completes.

## Solution
Render the entire page UI immediately, then fetch import jobs asynchronously. Show loading indicator only in the jobs table section.

## Implementation Plan

### Changes to `services/allegro-frontend-service/src/pages/ImportJobsPage.tsx`

1. **Remove blocking loading state**
   - Change initial `loading` state from `true` to `false` (line 40)
   - Remove the blocking `if (loading)` check (lines 536-538) that prevents page render
   - This allows the page to render immediately

2. **Rename loading state for clarity**
   - Rename `loading` to `loadingJobs` to indicate it only controls jobs table loading
   - Update all references to use `loadingJobs`

3. **Update jobs table section**
   - Show loading indicator in the jobs table section only when `loadingJobs` is true
   - Display "Loading import jobs..." message inside the Card component
   - Show empty state or loading state within the table area

4. **Ensure API call happens after render**
   - Keep the `useEffect` hook (lines 63-88) to trigger API call after component mounts
   - The page will already be rendered when the API call starts

5. **Update error handling**
   - Ensure errors are displayed even when page is already rendered
   - Error display should work independently of loading state

## Implementation Checklist

1. Change `const [loading, setLoading] = useState(true);` to `const [loadingJobs, setLoadingJobs] = useState(false);` on line 40
2. Remove the blocking `if (loading) { return <div>Loading import jobs...</div>; }` check (lines 536-538)
3. Update `setLoading(false)` to `setLoadingJobs(false)` in `loadJobs` function (line 114)
4. Update `setLoading(true)` to `setLoadingJobs(true)` at the start of `loadJobs` function (add before try block)
5. Update the jobs table section (lines 645-684) to show loading state:
   - When `loadingJobs` is true, show "Loading import jobs..." message
   - When `loadingJobs` is false and `jobs.length === 0`, show "No import jobs found."
   - When `loadingJobs` is false and `jobs.length > 0`, show the table
6. Test that page renders immediately
7. Test that jobs table shows loading indicator while fetching
8. Test that jobs appear after API call completes
9. Test error handling when API call fails
10. Verify 30-second auto-refresh still works correctly

## Expected Behavior After Fix

- Page renders instantly with all buttons and UI elements visible
- Jobs table section shows "Loading import jobs..." while fetching
- Jobs appear in table after API call completes
- Auto-refresh every 30 seconds continues to work
- Error messages display correctly if API call fails


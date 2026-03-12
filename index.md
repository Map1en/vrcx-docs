---
layout: false
---

<script setup>
import { onMounted } from 'vue';

onMounted(() => {
    // Use relative redirect so GitHub Pages project sites keep repo base path.
    window.location.replace('./zh/');
});
</script>

<noscript>
    <meta http-equiv="refresh" content="0; url=./zh/" />
    <a href="./zh/">跳转到中文文档</a>
</noscript>

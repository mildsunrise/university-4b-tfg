# Budget {#sec:budget}

Since this is a software project, and we've exclusively used open-source tools to produce this work, the project cost comes exclusively from the hours of work and equipment. Regarding the latter, while it is true that there was a risk of burning out the real disk drives on the computers, care was taken to perform all experiments in RAM to avoid incurring any additional hardware costs. Equipment consists of the machine we used to develop and run experiments, which costed \SI{1200}{\EUR} performing amoritzation over \SI{5000}{\hour} of use, this gives us a rate of \SI{0.24}{\EUR\per\hour}. We'll also account for \SI{20}{\watt} of electricity, which corresponds to \SI{8.76}{\EUR\per\hour}.

We'll consider a single role for this project, but given the variety of technologies we've had to work with we'll choose a higher reference than normal, \SI{20}{\EUR\per\hour}. The approximate time spent on this project accounted to around \SI{440}{\hour}.

Taking everything into account, we have \SI{8800}{\EUR} in terms of hours worked, and \SI{3960}{\EUR} regarding equipment & supplies. This adds up to a **total cost of \SI[detect-weight=true]{12760}{\EUR}**.


# Conclusions {#sec:conclusions}

This project turned out to be more work than expected, but we still managed to achive the specified mandatory requirements:

 - Tooling to perform experiments, non-invasive measurements and data analysis was successfully developed.

 - We got consistent results from both the analysis part and the proof-of-concept.

 - While far from a perfect solution, we successfully developed a PoC that is able to greatly reduce system unresponsiveness, even in the presence of large caches, in exchange for a minor performance drop.
 
 - Other than switching to the BFQ scheduler, the PoC operates in a non-invasive way: this makes it unlikely to introduce noticeable side effects, and appropriate for general use.

It wasn't an easy job due to the number of components involved and the nature of the problem, but it was fun and allowed us to work with a variety of amazing kernel technologies.

Like email or some filesystem aspects, the writeback cache is one more example of a complex, yet critical, component that was designed on a different context than today given how technology has evolved over the years.

Part of the incidentals were caused by a wrong assumption that these pauses came from the cache's throttling, which turned out not to be the case. It would have helped to be a bit more conservative when measuring the depth of the project, however these kind of risks are an inherent part of research.

All in all, we'd say this worked out as a productive and fun project, and hope it is useful to other people ---not only in providing insight about this particular problem in Linux, but also as a learning tool (together with the application \& scripts) to anyone seeking to learn how the kernel works and especially the page cache.


# Future work {#sec:future-work}

The immediate next steps would involve conducting a more precise analysis of the kernel subsystems to confirm our theory of unwanted pauses due to large flushes \& locked inodes and get some context on the matter. Again, the page cache is a complex component which involves three subsystems, so there can (and probably will) be additional interactions we've not been able to discover in this thesis.

It would also be beneficial for distributions to manage the cache thresholds and / or allow users to adjust them, or do it unassisted based on disk throughput.

As mentioned in section \ref{subsec:poc} inode locking is a natural part of the cache, however this doesn't remove from the fact that it is deeply unfair, and we shouldn't have to reduce cache size or mess with scheduling to alleviate those problems.

The cache was designed long ago when these problems didn't manifest themselves, so maybe it would be feasible to redesign (part of) it today so that data could be scheduled for I/O *without* being locked (i.e. lock it when the BIO is being processed, for instance). However this would probably require deep changes to the BIO layer, schedulers \& drivers. Another possibility would be to perform some kind of *double buffering* to allow for a second version of the inode to be modified while the first is in writeback state.

Our knowledge of the relevant subsystem (and the kernel in general) is still limited so we can't guarantee these things are entirely possible, but it seems worth to investigate them.
